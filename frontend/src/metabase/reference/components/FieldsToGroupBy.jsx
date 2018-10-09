import React, { Component } from "react";
import cx from "classnames";
import { connect } from "react-redux";

import S from "./UsefulQuestions.css";
import D from "metabase/reference/components/Detail.css";
import L from "metabase/components/List.css";

import { getQuestionUrl } from "../utils";

import FieldToGroupBy from "metabase/reference/components/FieldToGroupBy.jsx";

import { fetchTableMetadata } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";
import Metadata from "metabase-lib/lib/metadata/Metadata";

const mapDispatchToProps = {
  fetchTableMetadata,
};

const mapStateToProps = (state, props) => ({
  metadata: getMetadata(state, props),
});

@connect(mapStateToProps, mapDispatchToProps)
export default class FieldsToGroupBy extends Component {
  props: {
    fields: Object,
    databaseId: number,
    metric: Object,
    title: string,
    onChangeLocation: string => void,
    metadata: Metadata,
  };

  render() {
    const {
      fields,
      databaseId,
      metric,
      title,
      onChangeLocation,
      metadata,
    } = this.props;

    return (
      <div className={cx(D.detail)}>
        <div className={D.detailBody}>
          <div className={D.detailTitle}>
            <span className={D.detailName}>{title}</span>
          </div>
          <div className={S.usefulQuestions}>
            {fields &&
              Object.values(fields).map((field, index, fields) => (
                <FieldToGroupBy
                  key={field.id}
                  className={cx("border-bottom", "pt1", "pb1")}
                  iconClass={L.icon}
                  field={field}
                  metric={metric}
                  onClick={() =>
                    onChangeLocation(
                      getQuestionUrl({
                        dbId: databaseId,
                        tableId: field.table_id,
                        fieldId: field.id,
                        metricId: metric.id,
                        metadata,
                      }),
                    )
                  }
                  secondaryOnClick={event => {
                    event.stopPropagation();
                    onChangeLocation(
                      `/reference/databases/${databaseId}/tables/${
                        field.table_id
                      }/fields/${field.id}`,
                    );
                  }}
                />
              ))}
          </div>
        </div>
      </div>
    );
  }
}
