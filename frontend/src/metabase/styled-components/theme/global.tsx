import React from "react";
import { css, Global } from "@emotion/react";
import { connect } from "react-redux";
import _ from "underscore";
import { getFont } from "metabase/selectors/settings";
import { getEmbedOptions, getIsEmbedded } from "metabase/selectors/embed";
import { EmbedOptions, State } from "metabase-types/store";

interface GlobalStylesProps {
  font: string;
  embedOptions: EmbedOptions;
  isEmbedded: boolean;
}

const mapStateToProps = (state: State) => ({
  font: getFont(state),
  embedOptions: getEmbedOptions(state),
  isEmbedded: getIsEmbedded(),
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
