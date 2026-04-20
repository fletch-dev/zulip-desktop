/* eslint-disable @typescript-eslint/naming-convention */

import {defineConfig} from "electron-vite";
import {resolve} from "node:path";
import {copyFileSync, mkdirSync, existsSync, readdirSync} from "node:fs";

// plo:
function copyCssPlugin() {
  return {
    name: "copy-css",
    closeBundle() {
      const srcDir = resolve(__dirname, "app/renderer/css");
      const destDir = resolve(__dirname, "out/renderer/css");
      const publicCssDir = resolve(__dirname, "public/css");

      if (!existsSync(destDir)) {
        mkdirSync(destDir, {recursive: true});
      }

      if (!existsSync(publicCssDir)) {
        mkdirSync(publicCssDir, {recursive: true});
      }

      const files = readdirSync(srcDir);
      files.forEach((file) => {
        if (file.endsWith(".css")) {
          copyFileSync(
            resolve(srcDir, file),
            resolve(destDir, file),
          );
          // Also copy to public folder for webview CSS injection
          copyFileSync(
            resolve(srcDir, file),
            resolve(publicCssDir, file),
          );
        }
      });
    },
  };
}

export default defineConfig({
  main: {
    build: {
      sourcemap: true,
      rollupOptions: {
        input: {
          index: "app/main/index.ts",
        },
        external: ["electron", /^electron\//, /^gatemaker\//],
      },
    },
    resolve: {
      alias: {
        "zulip:remote": "electron/main",
      },
    },
  },
  preload: {
    build: {
      sourcemap: "inline",
      rollupOptions: {
        input: {
          preload: "app/renderer/js/preload.ts",
          renderer: "app/renderer/js/main.ts",
        },
        output: {
          format: "cjs",
        },
        external: ["electron", /^electron\//],
      },
      isolatedEntries: true,
    },
    resolve: {
      alias: {
        "zulip:remote": "@electron/remote",
      },
    },
  },
  renderer: {
    build: {
      sourcemap: true,
      rollupOptions: {
        input: {
          renderer: "app/renderer/main.html",
          network: "app/renderer/network.html",
          about: "app/renderer/about.html",
          preference: "app/renderer/preference.html",
        },
        plugins: [copyCssPlugin()], // plo:
      },
    },
    root: ".",
  },
});
