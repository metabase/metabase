var AddToDashIcon = React.createClass({
	getDefaultProps: function() {
	    return {
	    	width: '32',
			height: '32',
			className: 'Icon-addToDash',
			id: 'add-to-dash',
			fill: 'currentcolor'
	    };
  	},
	render: function () {
		return (
			<svg className={this.props.className} id={this.props.id} viewBox="0 0 32 32" fill={this.props.fill} width={this.props.width} height={this.props.height}>
				<path d="M16,31 L16,31 C24.2842712,31 31,24.2842712 31,16 C31,7.71572875 24.2842712,1 16,1 C7.71572875,1 1,7.71572875 1,16 C1,24.2842712 7.71572875,31 16,31 L16,31 Z M16,32 L16,32 C7.163444,32 0,24.836556 0,16 C0,7.163444 7.163444,0 16,0 C24.836556,0 32,7.163444 32,16 C32,24.836556 24.836556,32 16,32 L16,32 Z"></path>
				<path d="M17,15.5 L17,10 L15,10 L15,15.5 L9.5,15.5 L9.5,17.5 L15,17.5 L15,23 L17,23 L17,17.5 L22.5,17.5 L22.5,15.5 L17,15.5 Z"></path>
			</svg>
		);
	}
});
