import React, { Component } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import { t } from "c-3po";
import SegmentItem from "./SegmentItem.jsx";

export default class SegmentsList extends Component {
  static propTypes = {
    tableMetadata: PropTypes.object.isRequired,
    onRetire: PropTypes.func.isRequired,
  };

  render() {
    let { tableMetadata } = this.props;

    tableMetadata.segments = tableMetadata.segments || [];
    tableMetadata.segments = tableMetadata.segments.filter(
      sgmt => sgmt.archived === false,
    );

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
            {tableMetadata.segments.map(segment => (
              <SegmentItem
                key={segment.id}
                segment={segment}
                tableMetadata={tableMetadata}
                onRetire={this.props.onRetire}
              />
            ))}
          </tbody>
        </table>
        {tableMetadata.segments.length === 0 && (
          <div className="flex layout-centered m4 text-grey-3">
            {t`Create segments to add them to the Filter dropdown in the query builder`}
          </div>
        )}
      </div>
    );
  }
}
