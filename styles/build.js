const getConfig = (brand = "nexus") => ({
  source: [`tokens/${brand}/**/*.json`],
  platforms: {
    js: {
      transformGroup: "js",
      buildPath: "./styles/js/",
      files: [
        {
          destination: "variables.js",
          format: "javascript/es6",
        },
        {
          destination: "test.js",
          format: "myCustomFormat",
        },
      ],
    },
  },
});

const generateStyleDictionary = ({
  brand = process.env.BRAND || 'nexus',
  configFile = getConfig(brand),
}) => {
  console.log(brand);
  const StyleDictionary = require("style-dictionary").extend(configFile);
  const { fileHeader } = StyleDictionary.formatHelpers;
  StyleDictionary.registerFormat({
    name: "myCustomFormat",
    formatter: function ({ dictionary, file, options }) {
      const mantineTheme = {
        black: dictionary.properties.color.black.value,
        fontFamily: dictionary.properties.font.default.value,
        primaryShade: dictionary.properties.color.primaryShade.original.value,
      };

      /* GENERATE MANTINE COLOR THEME FORMAT */
      const colors = {};
      for (const [colorName, colorValues] of Object.entries(
        dictionary.properties.color.base,
      )) {
        console.log(colorName, colorValues);
        colors[colorName] = Object.values(colorValues).map(k => k.value);
      }

      mantineTheme.colors = colors;

      mantineTheme.fontSizes = {
        xs: dictionary.properties.size.font.xs.value,
        sm: dictionary.properties.size.font.sm.value,
        md: dictionary.properties.size.font.md.value,
        lg: dictionary.properties.size.font.lg.value,
        xl: dictionary.properties.size.font.xl.value,
      };
      return (
        fileHeader({ file }) + `export default ${JSON.stringify(mantineTheme)}`
      );
    },
  });

  StyleDictionary.buildAllPlatforms();
};

generateStyleDictionary({});

module.exports = { generateStyleDictionary };
