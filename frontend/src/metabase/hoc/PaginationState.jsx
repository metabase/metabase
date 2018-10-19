import React from "react";

const paginationState = () => ComposedComponent =>
  class extends React.Component {
    constructor(props) {
      super(props);
      this.state = {
        page: props.initialPage || 0,
        hasMorePages: null,
      };
    }
    handleChangeHasMorePages = hasMorePages => {
      this.setState({ hasMorePages });
    };
    handleNextPage = () => {
      this.setState({ page: this.state.page + 1, hasMorePages: null });
    };
    handlePreviousPage = () => {
      this.setState({ page: this.state.page - 1, hasMorePages: true });
    };
    render() {
      const isPaginated = typeof this.props.pageSize === "number";
      const extraProps = isPaginated
        ? {
            ...this.state,
            onChangeHasMorePages: this.handleChangeHasMorePages,
            onNextPage: this.state.hasMorePages ? this.handleNextPage : null,
            onPreviousPage:
              this.state.page > 0 ? this.handlePreviousPage : null,
          }
        : {};

      return <ComposedComponent {...extraProps} {...this.props} />;
    }
  };

export default paginationState;
