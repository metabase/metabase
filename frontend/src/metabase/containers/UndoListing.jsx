/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import S from "./UndoListing.css";

import { dismissUndo, performUndo } from "metabase/redux/undo";
import { getUndos } from "metabase/selectors/undo";

import Icon from "metabase/components/Icon";
import BodyComponent from "metabase/components/BodyComponent";

import ReactCSSTransitionGroup from "react-addons-css-transition-group";

const mapStateToProps = (state, props) => {
  return {
      undos: getUndos(state, props)
  }
}

const mapDispatchToProps = {
    dismissUndo,
    performUndo
}

@connect(mapStateToProps, mapDispatchToProps)
@BodyComponent
export default class UndoListing extends Component {
    static propTypes = {
        undos:          PropTypes.array.isRequired,
        performUndo:    PropTypes.func.isRequired,
        dismissUndo:    PropTypes.func.isRequired,
    };

    render() {
        const { undos, performUndo, dismissUndo } = this.props;
        return (
            <ul className={S.listing}>
                <ReactCSSTransitionGroup
                    transitionName="UndoListing"
                    transitionEnterTimeout={300}
                    transitionLeaveTimeout={300}
                >
                { undos.map(undo =>
                    <li key={undo._domId} className={S.undo}>
                        <div className={S.message}>
                            {typeof undo.message === "function" ? undo.message(undo) : undo.message}
                        </div>

                        <div className={S.actions}>
                            <a className={S.undoButton} onClick={() => performUndo(undo.id)}>Undo</a>
                            <Icon className={S.dismissButton} name="close" onClick={() => dismissUndo(undo.id)} />
                        </div>
                    </li>
                )}
                </ReactCSSTransitionGroup>
            </ul>
        );
    }
}
