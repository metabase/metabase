import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import withTableMetadataLoaded from "metabase/admin/datamodel/hoc/withTableMetadataLoaded";
import Tables from "metabase/entities/tables";

@Tables.load({ id: (state, { tableId }) => tableId, wrapped: true })
@withTableMetadataLoaded
export default class MetadataSchema extends Component {
  static propTypes = {
    tableMetadata: PropTypes.object,
  };

  render() {
    const { table } = this.props;
    if (!table || !table.fields) {
      return false;
    }

    const tdClassName = "py2 px1 border-bottom";

    const fields = table.fields.map(field => {
      return (
        <tr key={field.id}>
          <td className={tdClassName}>
            <span className="TableEditor-field-name text-bold">
              {field.name}
            </span>
          </td>
          <td className={tdClassName}>
            <span className="text-bold">{field.base_type}</span>
          </td>
          <td className={tdClassName} />
        </tr>
      );
    });

    return (
      <div className="MetadataTable px2 full">
        <div className="flex flex-column px1">
          <div className="TableEditor-table-name text-bold">{table.name}</div>
        </div>
        <table className="mt2 full">
          <thead className="text-uppercase text-medium py1">
            <tr>
              <th className={tdClassName}>{t`Column`}</th>
              <th className={tdClassName}>{t`Data Type`}</th>
              <th className={tdClassName}>{t`Additional Info`}</th>
            </tr>
          </thead>
          <tbody>{fields}</tbody>
        </table>
      </div>
    );
  }
}
