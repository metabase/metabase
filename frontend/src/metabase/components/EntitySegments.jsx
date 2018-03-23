import React from 'react'
import { Box } from 'rebass'
import { Link } from 'react-router'


const EntitySegments = ({ question }) => {
  const segments = question.query().filterSegmentOptions()


  if(!segments) {
    return null;
  }

  return (
    <Box>
      <h3>Segments for this</h3>
      { segments.map(segment => {
        const link = question.query().addFilter(["SEGMENT", segment.id]).question().getUrl()
        return (
          <Link to={link}>
            { segment.name}
          </Link>
        )
      }) }
    </Box>
  )
}

export default EntitySegments
