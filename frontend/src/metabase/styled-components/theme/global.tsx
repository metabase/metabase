import React from "react";
import { css, Global } from "@emotion/react";
import MetabaseSettings from "metabase/lib/settings";
import { State } from "metabase-types/store";

import { getEmbedOptions } from "metabase/selectors/embed";

interface GlobalStylesProps {
  embedOptions: any;
}

const mapStateToProps = (state: State) => ({
  embedOptions: getEmbedOptions(state),
});

const GlobalStyles = ({ embedOptions }: GlobalStylesProps) => {
  const isEmbedded = !!embedOptions;
  console.log("isEmbedded", isEmbedded);

  const applicationFontStyles = css`
    :root {
      --default-font-family: "${
        isEmbedded
          ? embedOptions.fond
          : MetabaseSettings.get("application-font")
      }";
    }`;

  return <Global styles={applicationFontStyles} />;
};
