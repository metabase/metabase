import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import S from "./UndoListing.css";

import { dismissUndo, performUndo } from "../undo";
import { getUndos } from "../selectors";

import Icon from "metabase/components/Icon";
import BodyComponent from "metabase/components/BodyComponent";

import ReactCSSTransitionGroup from "react-addons-css-transition-group";

const mapStateToProps = (state, props) => {
  return {
      undos: getUndos(state)
  }
}

const mapDispatchToProps = {
    dismissUndo,
    performUndo
}

@connect(mapStateToProps, mapDispatchToProps)
@BodyComponent
export default class UndoListing extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {};
    }

    static propTypes = {};
    static defaultProps = {};

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
                    <li key={undo.id} className={S.undo}>
                        <span className={S.message}>{undo.message}</span>
                        <span className={S.actions}>
                            <a className={S.undoButton} onClick={() => performUndo(undo.id)}>Undo</a>
                            <Icon className={S.dismissButton} name="close" onClick={() => dismissUndo(undo.id)} />
                        </span>
                    </li>
                )}
                </ReactCSSTransitionGroup>
            </ul>
        );
    }
}
