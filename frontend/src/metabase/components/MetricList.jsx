import React from 'react'
import { Box, Flex } from 'rebass'
import { Link } from 'react-router'

import { MetricApi } from 'metabase/services'

import Icon from 'metabase/components/Icon'

import { normal } from 'metabase/lib/colors'

class MetricLoader extends React.Component {
  state = {
    metrics: null,
    loading: false,
    error: null
  }

  componentWillMount () {
    this._loadMetrics()
  }

  async _loadMetrics () {
    try {
      this.setState({ loading: true, error: null })

      const metrics = await MetricApi.list()

      this.setState({ metrics, loading: false })

    } catch (error) {
      this.setState({ loading: false, error })
    }
  }

  render () {
    const { metrics, loading, error } = this.state
    return this.props.children({ metrics, loading, error })
  }
}

class MetricList extends React.Component {
  render () {
    return (
      <Box>
        <MetricLoader>
          {({ metrics, loading, error}) => {

            if(error) {
              return <Box>Error</Box>
            }

            if(loading) {
              return <Box>Loading...</Box>
            }

            return (
              <Box>
                { metrics.map(metric => <Box my={2}><MetricListItem metric={metric} /></Box>) }
              </Box>
            )
          }}
        </MetricLoader>
      </Box>
    )
  }
}

class MetricListItem extends React.Component {
  render () {
    const { metric } = this.props
    return (
      <Box>
        <Flex align='center'>
          <Flex mr={1} align='center'>
            <Icon name='insight' style={{ color : normal.green }} />
            <Link to=''>
              <h3>{ metric.name }</h3>
            </Link>
          </Flex>
        </Flex>
      </Box>
    )
  }
}

export default MetricList
