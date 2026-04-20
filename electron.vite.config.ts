/* eslint-disable @typescript-eslint/naming-convention */

import {defineConfig} from "electron-vite";
import {resolve} from "node:path";
import {copyFileSync, mkdirSync, existsSync, readdirSync} from "node:fs";

// plo: Copy CSS and JS from app/renderer to public/ and out/renderer/
function copyAssetsPlugin() {
  return {
    name: "copy-assets",
    closeBundle() {
      // === Copy CSS files ===
      const cssSrcDir = resolve(__dirname, "app/renderer/css");
      const cssDestDir = resolve(__dirname, "out/renderer/css");
      const cssPublicDir = resolve(__dirname, "public/css");

      if (!existsSync(cssDestDir)) {
        mkdirSync(cssDestDir, {recursive: true});
      }
      if (!existsSync(cssPublicDir)) {
        mkdirSync(cssPublicDir, {recursive: true});
      }

      const cssFiles = readdirSync(cssSrcDir);
      for (const file of cssFiles) {
        if (file.endsWith(".css")) {
          // Copy to out/renderer/css (production)
          copyFileSync(
            resolve(cssSrcDir, file),
            resolve(cssDestDir, file),
          );
          // Copy to public/css (dev mode webview)
          copyFileSync(
            resolve(cssSrcDir, file),
            resolve(cssPublicDir, file),
          );
        }
      }

      // === Copy JS files ===
      const jsSrcDir = resolve(__dirname, "app/renderer/js");
      const jsDestDir = resolve(__dirname, "out/renderer/js");
      const jsPublicDir = resolve(__dirname, "public/js");

      // Check if source directory exists and has JS files
      if (existsSync(jsSrcDir)) {
        if (!existsSync(jsDestDir)) {
          mkdirSync(jsDestDir, {recursive: true});
        }
        if (!existsSync(jsPublicDir)) {
          mkdirSync(jsPublicDir, {recursive: true});
        }

        const jsFiles = readdirSync(jsSrcDir);
        for (const file of jsFiles) {
          if (file.endsWith(".js")) {
            // Copy to out/renderer/js (production)
            copyFileSync(
              resolve(jsSrcDir, file),
              resolve(jsDestDir, file),
            );
            // Copy to public/js (dev mode webview)
            copyFileSync(
              resolve(jsSrcDir, file),
              resolve(jsPublicDir, file),
            );
          }
        }
      }
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
        plugins: [copyAssetsPlugin()], // plo:
      },
    },
    root: ".",
  },
});
