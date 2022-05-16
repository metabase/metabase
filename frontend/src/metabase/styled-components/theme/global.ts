import { css } from "@emotion/react";
import MetabaseSettings from "metabase/lib/settings";

export const applicationFontStyles = css`
:root {
  --default-font-family: "${MetabaseSettings.get("application-font")}";
}`;
