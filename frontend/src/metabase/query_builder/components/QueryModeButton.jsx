import React, { Component } from "react";
import PropTypes from "prop-types";

import cx from "classnames";
import { formatSQL, capitalize } from "metabase/lib/formatting";
import { getEngineNativeType, formatJsonQuery } from "metabase/lib/engine";
import Icon from "metabase/components/Icon.jsx";
import Modal from "metabase/components/Modal.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";
import { t } from "c-3po";

export default class QueryModeButton extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      isOpen: false,
    };
  }

  static propTypes = {
    mode: PropTypes.string.isRequired,
    allowNativeToQuery: PropTypes.bool,
    allowQueryToNative: PropTypes.bool,
    nativeForm: PropTypes.object,
    onSetMode: PropTypes.func.isRequired,
  };

  static defaultProps = {
    allowNativeToQuery: false,
  };

  render() {
    const {
      allowQueryToNative,
      allowNativeToQuery,
      mode,
      nativeForm,
      onSetMode,
      tableMetadata,
    } = this.props;

    // determine the type to switch to based on the type
    let targetType = mode === "query" ? "native" : "query";

    const engine = tableMetadata && tableMetadata.db.engine;
    const nativeQueryName =
      getEngineNativeType(engine) === "sql" ? t`SQL` : t`native query`;

    // maybe switch up the icon based on mode?
    let onClick = null;
    let tooltip = t`Not Supported`;
    if (mode === "query" && allowQueryToNative) {
      onClick = nativeForm
        ? () => this.setState({ isOpen: true })
        : () => onSetMode("native");
      tooltip = nativeForm
        ? t`View the ${nativeQueryName}`
        : t`Switch to ${nativeQueryName}`;
    } else if (mode === "native" && allowNativeToQuery) {
      onClick = () => onSetMode("query");
      tooltip = t`Switch to Builder`;
    }

    return (
      <div>
        <Tooltip tooltip={tooltip}>
          <span
            data-metabase-event={"QueryBuilder;Toggle Mode"}
            className={cx("cursor-pointer", {
              "text-brand-hover": onClick,
              "text-grey-1": !onClick,
            })}
            onClick={onClick}
          >
            <Icon name="sql" size={16} />
          </span>
        </Tooltip>

        <Modal
          medium
          isOpen={this.state.isOpen}
          onClose={() => this.setState({ isOpen: false })}
        >
          <div className="p4">
            <div className="mb3 flex flex-row flex-full align-center justify-between">
              <h2>{t`${capitalize(nativeQueryName)} for this question`}</h2>
              <span
                className="cursor-pointer"
                onClick={() => this.setState({ isOpen: false })}
              >
                <Icon name="close" size={16} />
              </span>
            </div>

            <pre className="mb3 p2 sql-code">
              {nativeForm &&
                nativeForm.query &&
                (getEngineNativeType(engine) === "json"
                  ? formatJsonQuery(nativeForm.query, engine)
                  : formatSQL(nativeForm.query))}
            </pre>

            <div className="text-centered">
              <a
                className="Button Button--primary"
                onClick={() => {
                  onSetMode(targetType);
                  this.setState({ isOpen: false });
                }}
              >{t`Convert this question to ${nativeQueryName}`}</a>
            </div>
          </div>
        </Modal>
      </div>
    );
  }
}
