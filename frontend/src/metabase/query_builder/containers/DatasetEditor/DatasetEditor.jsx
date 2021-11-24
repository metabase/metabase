import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Button from "metabase/components/Button";
import DebouncedFrame from "metabase/components/DebouncedFrame";
import EditBar from "metabase/components/EditBar";

import QueryVisualization from "metabase/query_builder/components/QueryVisualization";

import { Root, MainContainer, TableContainer } from "./DatasetEditor.styled";

const propTypes = {
  dataset: PropTypes.object.isRequired,
};

function DatasetEditor(props) {
  const { dataset } = props;

  return (
    <React.Fragment>
      <EditBar
        title={`You're editing ${dataset.displayName()}`}
        buttons={[
          <Button key="cancel" small>{t`Cancel`}</Button>,
          <Button key="save" small>{t`Save changes`}</Button>,
        ]}
      />
      <Root>
        <MainContainer>
          <TableContainer>
            <DebouncedFrame className="flex-full" enabled={false}>
              <QueryVisualization {...props} className="spread" noHeader />
            </DebouncedFrame>
          </TableContainer>
        </MainContainer>
      </Root>
    </React.Fragment>
  );
}

DatasetEditor.propTypes = propTypes;

export default DatasetEditor;
