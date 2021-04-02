/* eslint-disable react/prop-types */
import React from "react";

import AuditContent from "../components/AuditContent";
import AuditCustomView from "../containers/AuditCustomView";

import OpenInMetabase from "../components/OpenInMetabase";

import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";
import GuiQueryEditor from "metabase/query_builder/components/GuiQueryEditor";
import Question from "metabase-lib/lib/Question";

import * as QueryDetailCards from "../lib/cards/query_detail";

import { serializeCardForUrl } from "metabase/lib/card";

type Props = {
  params: { [key: string]: string },
};

const AuditQueryDetail = ({ params: { queryHash } }: Props) => (
  <AuditCustomView card={QueryDetailCards.details(queryHash)}>
    {({ result }) => {
      if (!result) {
        return null;
      }
      const datasetQuery = result.data.rows[0][0];
      if (!datasetQuery) {
        return <div>Query Not Recorded, sorry</div>;
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

import { connect } from "react-redux";
import { getMetadata } from "metabase/selectors/metadata";

import NativeQuery from "metabase-lib/lib/queries/NativeQuery";

import { loadMetadataForCard } from "metabase/query_builder/actions";

const mapStateToProps = state => ({ metadata: getMetadata(state) });
const mapDispatchToProps = { loadMetadataForCard };

@connect(
  mapStateToProps,
  mapDispatchToProps,
)
class QueryBuilderReadOnly extends React.Component {
  componentDidMount() {
    const { card, loadMetadataForCard } = this.props;
    loadMetadataForCard(card);
  }
  render() {
    const { card, metadata } = this.props;
    const question = new Question(card, metadata);

    const query = question.query();

    if (query instanceof NativeQuery) {
      return (
        <NativeQueryEditor
          question={question}
          query={query}
          location={{ query: {} }}
          readOnly
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

export default AuditQueryDetail;
