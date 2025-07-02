export const getAssetLoaders = () => [
  {
    test: /\.(svg|png)$/,
    type: "asset/inline",
    resourceQuery: { not: [/component|source/] },
  },
  {
    test: /\.svg/,
    type: "asset/source",
    resourceQuery: /source/, // *.svg?source
  },
  {
    test: /\.svg$/i,
    issuer: /\.[jt]sx?$/,
    resourceQuery: /component/, // *.svg?component
    use: [
      {
        loader: "@svgr/webpack",
        options: {
          ref: true,
        },
      },
    ],
  },
];
