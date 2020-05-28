import React, { Component } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import { t } from "ttag";
import SegmentItem from "./SegmentItem";

export default class SegmentsList extends Component {
  static propTypes = {
    tableMetadata: PropTypes.object.isRequired,
    onRetire: PropTypes.func.isRequired,
  };

  render() {
    const { onRetire, tableMetadata } = this.props;
    const { segments: allSegments = [] } = tableMetadata;
    const segments = allSegments.filter(s => !s.googleAnalyics);

    return (
      <div id="SegmentsList" className="my3">
        <div className="flex mb1">
          <h2 className="px1 text-purple">{t`Segments`}</h2>
          <Link
            to={"/admin/datamodel/segment/create?table=" + tableMetadata.id}
            data-metabase-event="Data Model;Add Segment Page"
            className="flex-align-right float-right text-bold text-brand no-decoration"
          >
            + {t`Add a Segment`}
          </Link>
        </div>
        <table className="AdminTable">
          <thead>
            <tr>
              <th style={{ minWidth: "200px" }}>{t`Name`}</th>
              <th className="full">{t`Definition`}</th>
              <th>{t`Actions`}</th>
            </tr>
          </thead>
          <tbody>
            {segments.map(segment => (
              <SegmentItem
                key={segment.id}
                onRetire={onRetire}
                segment={segment}
                tableMetadata={tableMetadata}
              />
            ))}
          </tbody>
        </table>
        {segments.length === 0 && (
          <div className="flex layout-centered m4 text-medium">
            {t`Create segments to add them to the Filter dropdown in the query builder`}
          </div>
        )}
      </div>
    );
  }
}
