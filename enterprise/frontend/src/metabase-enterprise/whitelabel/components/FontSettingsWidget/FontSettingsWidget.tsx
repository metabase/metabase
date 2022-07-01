import React from "react";
import MetabaseSettings from "metabase/lib/settings";
import FontSettings from "../FontSettings";

const FontSettingsWidget = (): JSX.Element => {
  return (
    <FontSettings
      font={"Lato"}
      availableFonts={MetabaseSettings.get("available-fonts")}
      fontFiles={[]}
      onChangeFont={() => 0}
      onChangeFontFiles={() => 0}
    />
  );
};

export default FontSettingsWidget;
