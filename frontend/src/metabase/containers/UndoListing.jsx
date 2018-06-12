/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import styled from "styled-components";
import { space } from "styled-system";
import { Flex } from "grid-styled";
import { t } from "c-3po";

import { normal } from "metabase/lib/colors";
import { dismissUndo, performUndo } from "metabase/redux/undo";
import { getUndos } from "metabase/selectors/undo";

import BodyComponent from "metabase/components/BodyComponent";
import Card from "metabase/components/Card";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

const mapStateToProps = (state, props) => ({
  undos: getUndos(state, props),
});

const mapDispatchToProps = {
  dismissUndo,
  performUndo,
};

const UndoList = styled.ul`
  ${space};
`;

@connect(mapStateToProps, mapDispatchToProps)
@BodyComponent
export default class UndoListing extends Component {
  static propTypes = {
    undos: PropTypes.array.isRequired,
    performUndo: PropTypes.func.isRequired,
    dismissUndo: PropTypes.func.isRequired,
  };

  render() {
    const { undos, performUndo, dismissUndo } = this.props;
    return (
      <UndoList m={2} className="fixed left bottom zF">
        {undos.map(undo => (
          <Card key={undo._domId} dark p={2}>
            <Flex align="center">
              {typeof undo.message === "function"
                ? undo.message(undo)
                : undo.message}

              {undo.actions && (
                <Link onClick={() => performUndo(undo.id)}>{t`Undo`}</Link>
              )}
              <Icon
                ml={1}
                color={normal.grey1}
                hover={{ color: normal.grey2 }}
                name="close"
                onClick={() => dismissUndo(undo.id)}
              />
            </Flex>
          </Card>
        ))}
      </UndoList>
    );
  }
}
