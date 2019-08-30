import React from "react";
import { t } from "ttag";
import _ from "underscore";

import Modal from "metabase/components/Modal";
import Icon from "metabase/components/Icon";
import Button from "metabase/components/Button";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import { formatNativeQuery, getEngineNativeType } from "metabase/lib/engine";

import { MetabaseApi } from "metabase/services";

const STRINGS = {
  "": {
    tooltip: t`View the native query`,
    title: t`Native query for this question`,
    button: t`Convert this question to a native query`,
  },
  sql: {
    tooltip: t`View the SQL`,
    title: t`SQL for this question`,
    button: t`Convert this question to SQL`,
  },
};

export default class NativeQueryButton extends React.Component {
  state = {
    open: false,
    loading: false,
    native: null,
    datasetQuery: null,
  };

  handleOpen = async () => {
    const { question } = this.props;
    const datasetQuery = question.datasetQuery();
    this.setState({ open: true });
    if (!_.isEqual(datasetQuery, this.state.datasetQuery)) {
      this.setState({ loading: true, error: null });
      try {
        const native = await MetabaseApi.native(datasetQuery);
        this.setState({ loading: false, native, datasetQuery });
      } catch (error) {
        console.error(error);
        this.setState({ loading: false, error });
      }
    }
  };
  handleClose = () => {
    this.setState({ open: false });
  };
  handleConvert = () => {
    this.props.question
      .setDatasetQuery({
        type: "native",
        native: { query: this.getFormattedQuery() },
        database: this.state.datasetQuery.database,
      })
      .update();
  };

  getFormattedQuery() {
    const { question } = this.props;
    const { native } = this.state;
    return formatNativeQuery(
      native && native.query,
      question.database().engine,
    );
  }

  render() {
    const { question, size, ...props } = this.props;
    const { loading, error } = this.state;

    const engineType = getEngineNativeType(question.database().engine);
    const { tooltip, title, button } =
      STRINGS[engineType] || Object.values(STRINGS)[0];

    return (
      <span {...props}>
        <Icon
          name="sql"
          size={size}
          tooltip={tooltip}
          onClick={this.handleOpen}
        />
        <Modal
          isOpen={this.state.open}
          title={title}
          footer={
            loading || error ? null : (
              <Button primary onClick={this.handleConvert}>
                {button}
              </Button>
            )
          }
          onClose={this.handleClose}
        >
          <LoadingAndErrorWrapper loading={loading} error={error}>
            <pre className="mb3 p2 sql-code">{this.getFormattedQuery()}</pre>
          </LoadingAndErrorWrapper>
        </Modal>
      </span>
    );
  }
}

NativeQueryButton.shouldRender = ({ question, queryBuilderMode }) =>
  queryBuilderMode === "notebook" &&
  question.isStructured() &&
  question.database() &&
  question.database().native_permissions === "write";
