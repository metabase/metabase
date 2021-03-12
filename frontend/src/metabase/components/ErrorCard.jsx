import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import BodyComponent from "metabase/components/BodyComponent";
import Card from "metabase/components/Card";
import Icon from "metabase/components/Icon";
import { t } from "ttag";

function ErrorCard({ errorInfo }) {
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    if (errorInfo) {
      setShowError(true);
    }
  }, [errorInfo]);

  return showError ? (
    <Card className="fixed right bottom zF" p={2} m={2} width={350}>
      <div className="flex justify-between align-center mb1">
        <div className="text-error flex align-center">
          <Icon name="info_outline" mr={1} size="20" />
          <h2>{t`Something went wrong`}</h2>
        </div>
        <Icon
          name="close"
          className="pl1 cursor-pointer text-dark"
          onClick={() => setShowError(false)}
        />
      </div>
      <pre style={{ height: "20vh" }} className="overflow-auto">
        {errorInfo.componentStack}
      </pre>
    </Card>
  ) : (
    showError
  );
}

ErrorCard.propTypes = {
  errorInfo: PropTypes.object,
};

export default BodyComponent(ErrorCard);
