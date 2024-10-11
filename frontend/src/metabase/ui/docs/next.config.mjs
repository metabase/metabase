import withMDX from "@next/mdx";

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ["js", "jsx", "ts", "tsx", "md", "mdx"],
};

const withMdx = withMDX({
  extension: /\.mdx?$/,
});

export default withMdx(nextConfig);
