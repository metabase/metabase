import React from "react";
import { css, Global } from "@emotion/react";
import { connect } from "react-redux";
import _ from "underscore";
import MetabaseSettings from "metabase/lib/settings";
import { IFRAMED } from "metabase/lib/dom";
import { getFont } from "metabase/selectors/settings";
import { getEmbedOptions } from "metabase/selectors/embed";
import { EmbedOptions, State } from "metabase-types/store";

interface GlobalStylesProps {
  font: string;
  embedOptions: EmbedOptions;
  isEmbedded: boolean;
}

const mapStateToProps = (state: State) => ({
  font: getFont(state),
  embedOptions: getEmbedOptions(state),
  isEmbedded: IFRAMED,
});

const GlobalStyles = ({
  font,
  embedOptions,
  isEmbedded,
}: GlobalStylesProps) => {
  const applicationFontStyles = css`
    :root {
      --default-font-family: "${isEmbedded ? embedOptions.font : font}";
    }`;

  return <Global styles={applicationFontStyles} />;
};

export default _.compose(connect(mapStateToProps))(GlobalStyles);
