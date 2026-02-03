import { plugin } from "bun";

// Bun plugin to handle SVG imports with ?component and ?source query params
// This mimics webpack's SVG loader behavior for tests
plugin({
  name: "svg-loader",
  setup(build) {
    // Handle .svg?component imports - returns a React component that renders an SVG
    // The component must forward all props (including aria-label) to work with the Icon component
    build.onLoad({ filter: /\.svg\?component$/ }, (args) => {
      // Extract the filename without path and extension for display name
      const filename = args.path.split("/").pop()?.replace(/\.svg\?component$/, "") ?? "Svg";
      // Convert to PascalCase (e.g., "arrow_left" -> "ArrowLeft")
      let componentName = filename
        .split(/[-_]/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join("") + "Icon";
      // Ensure valid JS identifier - can't start with a number (e.g., "10k" -> "Svg10k")
      if (/^\d/.test(componentName)) {
        componentName = "Svg" + componentName;
      }

      return {
        contents: `
          import { forwardRef } from "react";
          const ${componentName} = forwardRef(function ${componentName}(props, ref) {
            return <svg ref={ref} {...props} />;
          });
          export default ${componentName};
        `,
        loader: "jsx",
      };
    });

    // Handle .svg?source imports - returns raw SVG string
    build.onLoad({ filter: /\.svg\?source$/ }, () => {
      return {
        contents: `export default "<svg></svg>";`,
        loader: "js",
      };
    });

    // Handle plain .svg imports (without query params) - return a string path like Jest did
    build.onLoad({ filter: /\.svg$/ }, (args) => {
      // Skip if it has query params (handled above)
      if (args.path.includes("?")) {
        return;
      }
      return {
        contents: `export default "svg";`,
        loader: "js",
      };
    });
  },
});
