"use strict";

export default class TableCard extends React.Component {

    /* returns custom title for column set by user, or native label if
     * user did not specify a title
     *
     * @param index of the column in the card's dataset, as returned by dataset.data.columns
     */
     getDatasetColumnTitleByIndex(index) {
        var { card, data } = this.props;
        if (typeof card.visualization_settings !== "undefined" &&
            typeof card.visualization_settings.columns !== "undefined" &&
            typeof card.visualization_settings.columns.dataset_column_titles[index] !== "undefined") {
            return card.visualization_settings.columns.dataset_column_titles[index];
        } else {
            if (typeof data.cols !== "undefined") {
                return data.cols[index].name;
            } else if (typeof data.columns !== "undefined") {
                return data.columns[index];
            }
        }
    };

    render() {
        var { rows, cols } = this.props.data;
        return (
                <div className={"Card--table scroll-x scroll-y " + this.props.className}>
                    <table className="Table border-top">
                        <thead>
                            <tr>
                                { cols.map((column, colIndex) => <th key={colIndex}>{this.getDatasetColumnTitleByIndex(colIndex)}</th>) }
                            </tr>
                        </thead>
                        {
                            rows.slice(0, 100).map((row, rowIndex) =>
                                <tr key={rowIndex}>
                                    {row.map((cell, colIndex) => <td key={colIndex}>{cell}</td>)}
                                </tr>
                            )
                        }
                    </table>
                </div>
        );
    }
}

TableCard.defaultProps = {
    className: ""
};

TableCard.propTypes = {
    data: React.PropTypes.object.isRequired
};
