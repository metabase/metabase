import React from "react";
import Select, { Option } from "metabase/components/Select";
import { Flex, Box } from "grid-styled";
import { t } from "ttag";
import PropTypes from 'prop-types'

class ManageIndicatorHome extends React.PureComponent {
  static propTypes = {
    params: PropTypes.object,
  }

  constructor(props) {
    super(props);

    this.state = {
      category: "",
      state: "",
    }
  }

  handleCategoryChange = (e) => {
    this.setState({ category: e.target.value })
  }

  handleStateChange = (e) => {
    this.setState({ state: e.target.value })
  }

  render() {
    const { params: { slug } } = this.props
    const src = slug === '1'
      ? 'app/assets/img/scenes.png'
      : 'app/assets/img/scenes.png'

    const style = {
      position: 'fixed',
      top: '90px',
      bottom: 0,
      left: 0,
      right: 0,
    }

    return (
      <div style={style}>
        <img style={{ width: '100%', height: '100%' }} src={src}/>
      </div>
    )
    // return (
    //   <Box p={2}>
    //     <Flex>
    //       <Select
    //         value={this.state.category}
    //         options={[
    //           { id: 'a', name: '一人式' },
    //           { id: 'b', name: '一员式' },
    //           { id: 'c', name: '一户式' },
    //           { id: 'd', name: '一局式' },
    //           { id: 'e', name: '一票式' },
    //         ]}
    //         placeholder={t`please choose category`}
    //         onChange={this.handleCategoryChange}
    //         optionValueFn={field => field.id}
    //       />
    //       <Select
    //         className="ml2"
    //         value={this.state.state}
    //         options={[
    //           { id: 'a', name: '草稿' },
    //           { id: 'b', name: '已定义' },
    //           { id: 'c', name: '已添加数据源' },
    //           { id: 'd', name: '已添加图表' },
    //         ]}
    //         placeholder={t`please choose state`}
    //         onChange={this.handleStateChange}
    //         optionValueFn={field => field.id}
    //         multiple
    //       />
    //     </Flex>
    //   </Box>
    // );
  }
}

export default ManageIndicatorHome;
