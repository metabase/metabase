import React from "react";
import { Box, Flex } from "rebass";
import { Link } from 'react-router'

import Icon from 'metabase/components/Icon'
import SegmentListLoader from "metabase/components/SegmentListLoader";
import { selectable, selectManager } from 'metabase/dashboards/components/DashboardList'

import { normal } from 'metabase/lib/colors'

@selectManager
class SegmentList extends React.Component {
  render () {
    const { selectedItems, onSelectItem } = this.props
    return (
      <SegmentListLoader>
        {({ segments, loading, error }) => {
          if(loading) {
            return <Box>Loading...</Box>
          }
          return (
            <Flex>
              {segments.map(segment =>
                <Box w={1/4}>
                  <SegmentItem
                    segment={segment}
                    onSelectItem={onSelectItem}
                    selectedItems={selectedItems}
                  />
                </Box>
              )}
            </Flex>
          )
        }}
      </SegmentListLoader>
    );
  }
}

@selectable((props) => props.segment.id)
class SegmentItem extends React.Component {
  render () {
    const { segment } = this.props
    return (
      <Box style={{ backgroundColor: '#F8F8FA', borderRadius: 6 }} w='100%' h={40} p={2}>
        <Flex align='center'>
          <Flex p={1} align='center' justify='center'>
            <Icon name="segment" style={{ color: normal.indigo }} />
          </Flex>
          <Link to=''>
            <h3>{segment.name}</h3>
          </Link>
        </Flex>
      </Box>
    )
  }
}

export default SegmentList;
