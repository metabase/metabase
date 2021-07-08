import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { isCypressActive, isProduction } from "metabase/env";

import BodyComponent from "metabase/components/BodyComponent";
import Icon from "metabase/components/Icon";
import Button from "metabase/components/Button";
import { FullscreenCard, FixedCard } from "./AppErrorCard.styled";

const CardComponent = isCypressActive ? FullscreenCard : FixedCard;
const isInEnvWhereErrorShouldBeShown = !isProduction || isCypressActive;

export default BodyComponent(AppErrorCard);

AppErrorCard.propTypes = {
  errorInfo: PropTypes.shape({
    componentStack: PropTypes.string,
  }),
};

function AppErrorCard({ errorInfo }) {
  const [hasNewError, setHasNewError] = useState(false);

  useEffect(() => {
    if (errorInfo) {
      setHasNewError(true);
    }
  }, [errorInfo]);

  const showError = hasNewError && isInEnvWhereErrorShouldBeShown;

  return showError ? (
    <CardComponent>
      <div className="flex justify-between align-center mb1">
        <div className="text-error flex align-center">
          <Icon name="info_outline" mr={1} size="20" />
          <h2>{t`Something went wrong`}</h2>
        </div>
        <Button
          onlyIcon
          icon="close"
          className="pl1"
          onClick={() => setHasNewError(false)}
        />
      </div>
      <pre>{errorInfo.componentStack}</pre>
    </CardComponent>
  ) : null;
}
