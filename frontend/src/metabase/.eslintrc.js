const commonPatterns = [
  "metabase-enterprise",
  "metabase-enterprise/*",
  "cljs/metabase.lib*",
];

const commonPaths = [
  {
    name: "react-redux",
    importNames: ["useSelector", "useDispatch"],
    message: "Please import from `metabase/lib/redux` instead.",
  },
];

// eslint-disable-next-line import/no-commonjs
module.exports = {
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: commonPatterns,
        paths: commonPaths,
      },
    ],
  },
  overrides: [
    {
      files: ["**/*.unit.spec.{js,jsx,ts,tsx}"],
      rules: {
        "no-console": 0,
      },
    },
    {
      files: ["**/*.stories.tsx"],
      rules: {
        "import/no-default-export": 0,
      },
    },
    {
      files: ["lib/redux/hooks.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: commonPatterns,
          },
        ],
      },
    },
    {
      files: ["*.styled.tsx"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: commonPatterns,
            paths: [
              ...commonPaths,
              {
                name: "@emotion/styled",
                message: "Please use import from `metabase/ui/utils` instead",
              },
            ],
          },
        ],
      },
    },
  ],
};
