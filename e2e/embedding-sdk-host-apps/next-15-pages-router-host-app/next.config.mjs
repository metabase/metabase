import path from "path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack(config) {
    // To force CJS resolving for dependencies
    if (config.resolve && process.env.BUNDLE_FORMAT === "cjs") {
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        "@metabase/embedding-sdk-react/nextjs": path.resolve(
          import.meta.dirname,
          "node_modules/@metabase/embedding-sdk-react/dist/nextjs.cjs",
        ),
      };
    }

    return config;
  },
};

export default nextConfig;
