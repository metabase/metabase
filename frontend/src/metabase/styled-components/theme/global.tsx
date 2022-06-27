import React from "react";
import _ from "underscore";
import { connect } from "react-redux";

import { css, Global } from "@emotion/react";
import MetabaseSettings from "metabase/lib/settings";
import { State } from "metabase-types/store";
import { IFRAMED } from "metabase/lib/dom";
import { getEmbedOptions } from "metabase/selectors/embed";

interface GlobalStylesProps {
  embedOptions: any;
  isEmbedded: boolean;
}

const mapStateToProps = (state: State) => ({
  embedOptions: getEmbedOptions(state),
  isEmbedded: IFRAMED,
});

const GlobalStyles = ({ embedOptions, isEmbedded }: GlobalStylesProps) => {
  const applicationFontStyles = css`
    :root {
      --default-font-family: "${
        isEmbedded
          ? embedOptions.font
          : MetabaseSettings.get("application-font")
      }";
    }`;

  return <Global styles={applicationFontStyles} />;
};

export default _.compose(connect(mapStateToProps))(GlobalStyles);
