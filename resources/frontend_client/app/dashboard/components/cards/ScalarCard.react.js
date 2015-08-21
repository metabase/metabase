"use strict";

export default class ScalarCard extends React.Component {
    render() {
        return (
            <div className={"Card--scalar " + this.props.className||""}>
                <h1 className="Card-scalarValue text-normal">{this.props.data.rows[0][0]}</h1>
            </div>
        );
    }
}

ScalarCard.defaultProps = {
    className: ""
};

ScalarCard.propTypes = {
    data: React.PropTypes.object.isRequired
};
