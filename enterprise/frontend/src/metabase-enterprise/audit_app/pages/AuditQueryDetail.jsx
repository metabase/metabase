/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import _ from "underscore";

import { connect } from "react-redux";
import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";

import GuiQueryEditor from "metabase/query_builder/components/GuiQueryEditor";

import { serializeCardForUrl } from "metabase/lib/card";

const AuditQueryDetail = ({ params: { queryHash } }) => (
  <AuditCustomView card={QueryDetailCards.details(queryHash)}>
    {({ result }) => {
      if (!result) {
        return null;
      }
      const datasetQuery = result.data.rows[0][0];
      if (!datasetQuery) {
        return <div>{t`Query Not Recorded, sorry`}</div>;
      }

      return (
        <AuditContent
          title="Query"
          subtitle={
            <OpenInMetabase
              to={
                "/question#" +
                serializeCardForUrl({
                  dataset_query: datasetQuery,
                })
              }
            />
          }
        >
          <div className="pt4" style={{ pointerEvents: "none" }}>
            <QueryBuilderReadOnly
              card={{
                name: "",
                visualization_settings: {},
                display: "table",
                dataset_query: datasetQuery,
              }}
            />
          </div>
        </AuditContent>
      );
    }}
  </AuditCustomView>
);

import { getMetadata } from "metabase/selectors/metadata";

import ExplicitSize from "metabase/components/ExplicitSize";
import { loadMetadataForCard } from "metabase/query_builder/actions";
import NativeQuery from "metabase-lib/queries/NativeQuery";
import Question from "metabase-lib/Question";
import * as QueryDetailCards from "../lib/cards/query_detail";
import OpenInMetabase from "../components/OpenInMetabase";
import AuditCustomView from "../containers/AuditCustomView";
import AuditContent from "../components/AuditContent";

const mapStateToProps = state => ({ metadata: getMetadata(state) });
const mapDispatchToProps = { loadMetadataForCard };

class QueryBuilderReadOnlyInner extends React.Component {
  state = {
    isNativeEditorOpen: false,
  };

  setIsNativeEditorOpen = open => {
    this.setState({ isNativeEditorOpen: open });
  };

  componentDidMount() {
    const { card, loadMetadataForCard } = this.props;
    loadMetadataForCard(card);
  }

  render() {
    const { card, metadata, height } = this.props;
    const question = new Question(card, metadata);

    const query = question.query();

    if (query instanceof NativeQuery) {
      return (
        <NativeQueryEditor
          question={question}
          query={query}
          location={{ query: {} }}
          readOnly
          viewHeight={height}
          isNativeEditorOpen={this.state.isNativeEditorOpen}
          setIsNativeEditorOpen={this.setIsNativeEditorOpen}
        />
      );
    } else {
      const tableMetadata = query.table();
      return tableMetadata ? (
        <GuiQueryEditor
          datasetQuery={card.dataset_query}
          query={query}
          databases={tableMetadata && [tableMetadata.db]}
          setDatasetQuery={() => {}} // no-op to appease flow
          readOnly
        />
      ) : null;
    }
  }
}

const QueryBuilderReadOnly = _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  ExplicitSize(),
)(QueryBuilderReadOnlyInner);

export default AuditQueryDetail;
