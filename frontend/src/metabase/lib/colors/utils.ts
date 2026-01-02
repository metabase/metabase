import {
  contrast,
  BackgroundColor,
  Color,
  ContrastColor,
  type CssColor,
  Theme,
} from "@adobe/leonardo-contrast-colors";

import _ from "underscore";

import C from "color";

const RATIOS = [
  1.05, 1.1, 1.34, 1.94, 2.86, 3.56, 5.09, 7.86, 11.56, 15.33, 18.16, 19.44,
];

type ColorMap = {
  110?: CssColor;
  100: CssColor;
  90: CssColor;
  80: CssColor;
  70: CssColor;
  60: CssColor;
  50: CssColor;
  40: CssColor;
  30: CssColor;
  20: CssColor;
  10: CssColor;
  5: CssColor;
};

type MapWithSuffixes<T extends string, N extends string> = {
  [K in `${T}${N}`]: ColorMap;
};

export const generateSteps = <const T extends string>(
  colors: Record<T, CssColor>,
): MapWithSuffixes<T | "background", "" | "Alpha" | "AlphaInverse"> => {
  const background = new BackgroundColor({
    name: "background",
    colorKeys: ["#FFF"],
    ratios: RATIOS,
    smooth: false,
    colorspace: "HSL",
  });

  const input = [
    ...Object.keys(colors).map(
      (name) =>
        new Color({
          name,
          colorKeys: [colors[name]],
          ratios: RATIOS,
          smooth: false,
          colorspace: "HSL",
        }),
    ),
  ];

  const theme = new Theme({
    colors: input,
    backgroundColor: background,
    lightness: 100,
    contrast: 1,
    saturation: 100,
    output: "HSL",
  });

  const { contrastColors } = theme;

  return contrastColors.slice(1).reduce((acc, cc) => {
    const { name, values: contrastColorValues } = cc as ContrastColor;

    const ogColor = colors[name];
    const ogColorContrast = contrast(C(ogColor).rgb().color, [255, 255, 255]);

    const ogColorStepIndex = RATIOS.reduce((prevIndex, val, index, arr) => {
      const preVal = arr[prevIndex];
      return Math.abs(preVal - ogColorContrast) <
        Math.abs(val - ogColorContrast)
        ? prevIndex
        : index;
    });

    console.log(name, ogColorContrast, ogColorStepIndex);

    const steps = {
      110: contrastColorValues[11].value,
      100: contrastColorValues[10].value,
      90: contrastColorValues[9].value,
      80: contrastColorValues[8].value,
      70: contrastColorValues[7].value,
      60: contrastColorValues[6].value,
      50: contrastColorValues[5].value,
      40: contrastColorValues[4].value,
      30: contrastColorValues[3].value,
      20: contrastColorValues[2].value,
      10: contrastColorValues[1].value,
      5: contrastColorValues[0].value,
    };

    return {
      ...acc,
      [name]: steps,
      [`${name}Alpha`]: generateAplhaSteps(
        contrastColorValues[ogColorStepIndex].value,
      ),
      [`${name}AlphaInverse`]: generateAplhaSteps(
        contrastColorValues[ogColorStepIndex].value,
        true,
      ),
    };
  }, {});
};

const generateAplhaSteps = (input: CssColor, reverse: boolean = false) => {
  const color = C(input);

  return reverse
    ? {
        5: color.alpha(1).toString(),
        10: color.alpha(0.93).toString(),
        20: color.alpha(0.84).toString(),
        30: color.alpha(0.74).toString(),
        40: color.alpha(0.62).toString(),
        50: color.alpha(0.51).toString(),
        60: color.alpha(0.44).toString(),
        70: color.alpha(0.29).toString(),
        80: color.alpha(0.17).toString(),
        90: color.alpha(0.05).toString(),
        100: color.alpha(0.02).toString(),
      }
    : {
        100: color.alpha(1).toString(),
        90: color.alpha(0.93).toString(),
        80: color.alpha(0.84).toString(),
        70: color.alpha(0.74).toString(),
        60: color.alpha(0.62).toString(),
        50: color.alpha(0.51).toString(),
        40: color.alpha(0.44).toString(),
        30: color.alpha(0.29).toString(),
        20: color.alpha(0.17).toString(),
        10: color.alpha(0.05).toString(),
        5: color.alpha(0.02).toString(),
      };
};
