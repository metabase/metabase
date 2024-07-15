// eslint-disable-next-line no-restricted-imports
import { Input } from "@mantine/core";
import { type ChangeEvent, Fragment, useState } from "react";

import { colors } from "metabase/lib/colors";

const Palette = () => {
  const [palette, setPalette] = useState(colors);

  const handleChangeColor =
    (colorKey: string) => (e: ChangeEvent<HTMLInputElement>) => {
      localStorage.setItem(
        "colorPalette",
        JSON.stringify({
          ...palette,
          [colorKey]: e.target.value,
        }),
      );
      setPalette(
        JSON.parse(localStorage.getItem("colorPalette") ?? "null") ?? colors,
      );
    };

  return (
    <div>
      <h1>Palette</h1>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          padding: "24px",
        }}
      >
        {Object.entries(palette).map(([colorName, value]) => (
          <Fragment key={colorName}>
            <span style={{ fontSize: "20px" }}>{colorName}</span>
            <span style={{ fontSize: "20px" }}>{value}</span>
            <Input
              type="color"
              value={value}
              onChange={handleChangeColor(colorName)}
            />
          </Fragment>
        ))}
      </div>
    </div>
  );
};

export { Palette };
