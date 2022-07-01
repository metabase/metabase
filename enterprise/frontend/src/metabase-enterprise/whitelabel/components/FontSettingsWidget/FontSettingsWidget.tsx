import React from "react";
import FontSettings from "../FontSettings";

const FontSettingsWidget = (): JSX.Element => {
  return (
    <FontSettings
      fontFamily={null}
      fontFiles={[]}
      onChangeFontFamily={() => 0}
      onChangeFontFiles={() => 0}
    />
  );
};

export default FontSettingsWidget;
