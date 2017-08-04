import cxs from 'cxs'
import React from 'react'

const Card = ({ children }) =>
    <div className={cxs({
        background: '#fff',
        border: '1px solid #DCE1E4',
        boxShadow: '0 1px 3px #DCE1E4',
        borderRadius: 6,
        transition: 'box-shadow 300ms linear',
        ':hover': {
            boxShadow: '0 1px 6px #DCE1E4'
        }
    })}>
        { children }
    </div>

export default Card
