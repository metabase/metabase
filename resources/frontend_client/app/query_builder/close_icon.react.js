var CloseIcon = React.createClass({
	getDefaultProps: function() {
	    return {
	    	width: '32',
			height: '32',
			className: 'Icon-close',
			id: 'check',
			fill: 'currentcolor'
	    };
  	},
	render: function () {
		return (
			<svg className={this.props.className} id={this.props.id} viewBox="0 0 32 32" fill={this.props.fill} width={this.props.width} height={this.props.height}>
				<path d="M4 8 L8 4 L16 12 L24 4 L28 8 L20 16 L28 24 L24 28 L16 20 L8 28 L4 24 L12 16 z "></path>
			</svg>
		);
	}
});
