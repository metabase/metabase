import { useCallback, useMemo } from "react";

import {
  DEFAULT_SDK_FONT_SIZE,
  type MetabaseColor,
  type MetabaseTheme,
} from "metabase/embedding-sdk/theme";
import { getSizeInPx } from "metabase/visualizations/shared/utils/size-in-px";

import { useDefaultEmbeddingTheme } from "../../hooks/use-default-embedding-theme";

// TODO(EMB-942): add embedding theme preview placeholder card
export const EmbeddingThemeCardPreview = ({
  theme,
}: {
  theme: MetabaseTheme;
}) => {
  const { colors } = theme ?? {};
  const defaultTheme = useDefaultEmbeddingTheme();

  const colorOf = (key: Exclude<MetabaseColor, "charts">) =>
    colors?.[key] ?? defaultTheme.colors?.[key];

  // Get preview font sizes.
  const getPreviewValue = useCallback(
    (pxValue: number) => {
      const emValue = pxValue / DEFAULT_SDK_FONT_SIZE;
      const baseFontSize = getSizeInPx(theme.fontSize) ?? DEFAULT_SDK_FONT_SIZE;

      return getSizeInPx(`${emValue}em`, baseFontSize);
    },
    [theme.fontSize],
  );

  const [h1FontSize, h2FontSize, smFontSize] = useMemo(
    () => [getPreviewValue(24), getPreviewValue(16), getPreviewValue(12)],
    [getPreviewValue],
  );

  const chartColorOf = (index: number): string => {
    const color =
      colors?.charts?.[index] ?? defaultTheme.colors?.charts?.[index];

    // The SDK can take an object of {base, tint?, shade?} for chart colors.
    if (typeof color === "object" && color.base) {
      return color.base;
    }

    if (typeof color === "string") {
      return color;
    }

    return "";
  };

  const chart0 = chartColorOf(0);
  const chart1 = chartColorOf(1);
  const chart2 = chartColorOf(2);

  return (
    <svg
      viewBox="0 0 250 250"
      fill="none"
      style={{ borderBottom: "1px solid var(--mb-color-border)" }}
    >
      <g>
        <path d="M0 0H251V251H0V0Z" fill={colorOf("background-secondary")} />

        <text
          x="28"
          y="48"
          fill={colorOf("text-primary")}
          fontSize={h1FontSize}
          fontWeight="600"
        >
          {"Abc"}
        </text>

        <rect
          x="28"
          y="69"
          width="435"
          height="269"
          rx="6"
          fill={colorOf("background")}
        />

        <rect
          x="28.5"
          y="69.5"
          width="434"
          height="268"
          rx="5.5"
          stroke="#071722"
          strokeOpacity="0.14"
        />

        <line x1="97" y1="142.5" x2="437" y2="142.5" stroke="#EEECEC" />
        <line x1="97" y1="188.5" x2="437" y2="188.5" stroke="#EEECEC" />
        <line x1="97" y1="235.5" x2="437" y2="235.5" stroke="#EEECEC" />

        <text
          x="60"
          y="147"
          fill={colorOf("text-secondary")}
          fontSize={smFontSize}
        >
          300
        </text>
        <text
          x="60"
          y="193"
          fill={colorOf("text-secondary")}
          fontSize={smFontSize}
        >
          200
        </text>
        <text
          x="60"
          y="239"
          fill={colorOf("text-secondary")}
          fontSize={smFontSize}
        >
          100
        </text>

        <text
          x="60"
          y="107"
          fill={colorOf("text-primary")}
          fontSize={h2FontSize}
          fontWeight="700"
        >
          {"Theme preview"}
        </text>

        <rect x="97" y="236.539" width="18.77" height="13.4699" fill={chart0} />
        <rect x="97" y="206.758" width="18.77" height="29.7755" fill={chart1} />
        <rect x="97" y="194" width="18.77" height="12.7609" fill={chart2} />
        <rect
          x="132"
          y="232.445"
          width="18.77"
          height="17.5579"
          fill={chart0}
        />
        <rect
          x="132"
          y="193.633"
          width="18.77"
          height="38.8122"
          fill={chart1}
        />
        <rect x="132" y="177" width="18.77" height="16.6338" fill={chart2} />
        <rect
          x="167"
          y="229.078"
          width="18.77"
          height="20.9251"
          fill={chart0}
        />
        <rect
          x="167"
          y="182.824"
          width="18.77"
          height="46.2556"
          fill={chart1}
        />
        <rect x="167" y="163" width="18.77" height="19.8238" fill={chart2} />
        <rect
          x="202"
          y="226.191"
          width="18.77"
          height="23.8107"
          fill={chart0}
        />
        <rect
          x="202"
          y="173.559"
          width="18.77"
          height="52.6342"
          fill={chart1}
        />
        <rect x="202" y="151" width="18.77" height="22.5575" fill={chart2} />
        <rect
          x="237"
          y="221.859"
          width="18.77"
          height="28.1393"
          fill={chart0}
        />
        <rect x="237" y="159.66" width="18.77" height="62.2027" fill={chart1} />
        <rect x="237" y="133" width="18.77" height="26.6583" fill={chart2} />
      </g>
    </svg>
  );
};
