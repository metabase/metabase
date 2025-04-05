import withMDX from "@next/mdx";

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ["js", "jsx", "ts", "tsx", "md", "mdx"],
};

const withMdx = withMDX({
  extension: /\.mdx?$/,
  processor: {
    providerImportSource: "@mdx-js/react",
  },
});

export default withMdx(nextConfig);
