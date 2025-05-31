import { transform as esbuildTransform } from "esbuild";

import { CSS_MODULE_INJECT_FUNCTION_NAME } from "../constants/css-module-inject-function-name.mjs";

export const getCssModulesInjectCode = async () => {
  const code = `
    if (typeof window['${CSS_MODULE_INJECT_FUNCTION_NAME}'] !== 'function') {
       window['${CSS_MODULE_INJECT_FUNCTION_NAME}'] = function (css, { insertAt } = {}) {
        if (!css || typeof document === 'undefined') return

        const head = document.head || document.getElementsByTagName('head')[0]
        const style = document.createElement('style')
        style.type = 'text/css'

        if (insertAt === 'top') {
          if (head.firstChild) {
            head.insertBefore(style, head.firstChild)
          } else {
            head.appendChild(style)
          }
        } else {
          head.appendChild(style)
        }

        if (style.styleSheet) {
          style.styleSheet.cssText = css
        } else {
          style.appendChild(document.createTextNode(css))
        }
      }
    }
  `;

  return (
    await esbuildTransform(code, {
      minify: true,
      minifyIdentifiers: true,
      minifySyntax: true,
      minifyWhitespace: true,
      loader: "js",
    })
  ).code;
};
