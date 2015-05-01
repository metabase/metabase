var DownloadIcon = React.createClass({
	getDefaultProps: function() {
	    return {
	    	width: '32',
			height: '32',
			className: 'Icon-download',
			id: 'download',
			fill: 'currentcolor'
	    };
  	},
	render: function () {
		return (
			<svg className={this.props.className} id={this.props.id} viewBox="0 0 32 32" fill={this.props.fill} width={this.props.width} height={this.props.height}>
	            <path d="M17,16.5 L17,8 L15,8 L15,16.5 L11,16.5 L9.93247919,16.5 L10.6158894,17.3200922 L15.6158894,23.3200922 L16,23.781025 L16.3841106,23.3200922 L21.3841106,17.3200922 L22.0675208,16.5 L21,16.5 L17,16.5 L17,16.5 Z"></path>
	            <path d="M16,31 L16,31 C24.2842712,31 31,24.2842712 31,16 C31,7.71572875 24.2842712,1 16,1 C7.71572875,1 1,7.71572875 1,16 C1,24.2842712 7.71572875,31 16,31 L16,31 Z M16,32 L16,32 C7.163444,32 0,24.836556 0,16 C0,7.163444 7.163444,0 16,0 C24.836556,0 32,7.163444 32,16 C32,24.836556 24.836556,32 16,32 L16,32 Z"></path>
			</svg>
		);
	}
});
