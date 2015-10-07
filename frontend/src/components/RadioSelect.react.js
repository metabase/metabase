import cx from "classnames";

export default React.createClass({
    displayName: "RadioButtons",
    propTypes: {
        value: React.PropTypes.any,
        options: React.PropTypes.array.isRequired,
        onChange: React.PropTypes.func,
        optionNameFn: React.PropTypes.func,
        optionValueFn: React.PropTypes.func,
        optionKeyFn: React.PropTypes.func
    },

    getDefaultProps: function() {
        return {
            optionNameFn: (option) => option,
            optionValueFn: (option) => option,
            optionKeyFn: (option) => option
        };
    },

    render: function() {
        var options = this.props.options.map((option) => {
            var name = this.props.optionNameFn(option);
            var value = this.props.optionNameFn(option);
            var key = this.props.optionKeyFn(option);
            var classes = cx("h3", "text-bold", "text-brand-hover", "no-decoration",  { "text-brand": this.props.value === value });
            return (
                <li className="mr3" key={key}>
                    <a className={classes} href="#" onClick={this.props.onChange.bind(null, value)}>{name}</a>
                </li>
            );
        });
        return <ul className="flex text-grey-4">{options}</ul>
    }
});
