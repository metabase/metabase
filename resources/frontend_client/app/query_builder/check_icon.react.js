'use strict';

var CheckIcon = React.createClass({
	getDefaultProps: function() {
	    return {
	    	width: '32',
			height: '32',
			className: 'Icon-check',
			id: 'check',
			fill: 'currentcolor'
	    };
  	},

	render: function() {
		return (
			<svg className={this.props.className} id={this.props.id} viewBox="0 0 32 32" fill={this.props.fill} width={this.props.width} height={this.props.height}>
    			<path d="M1 14 L5 10 L13 18 L27 4 L31 8 L13 26 z "></path>
			</svg>

		);
	}
});
