import React from 'react'
import cx from 'classnames'

const SimpleHistogram = ({ data, height = 120, gridLines = true, legends = true , showValues = true}) => {

    const max = Math.max.apply(null, Object.values(data))

    const getHeight = (val) => {
        return val / max * 100
    }

    return (
        <div>
            <ol
                className="flex full"
                style={{
                    height,
                    backgroundImage: gridLines ? `linear-gradient(to top,
                        rgba(0, 0, 0, 0.1) 2%,
                        rgba(0, 0, 0, 0) 2%)` : null,
                    backgroundSize: `100% ${height/4}px`,
                    backgroundPosition: 'left top',
                }}
            >
                { data && Object.keys(data).map(key =>
                    <li
                        key={key}
                        className="relative flex-full bg-brand"
                        style={{
                            marginTop: 'auto',
                            border: '0.25px solid #fff',
                            height: `${getHeight(data[key])}%`,
                            opacity: 0.85
                        }}
                    >
                        <span
                            className={cx('absolute left text-bold right text-centered', { 'hidden': !showValues })}
                            style={{ top: -20 }}
                        >
                            {data[key]}
                        </span>
                    </li>
                )}
            </ol>
            { legends && (
                <ol
                    className="flex full my2"
                >
                    { data && Object.keys(data).map(key =>
                        <li
                            key={key}
                            className="flex-full text-bold text-centered"
                        >
                            {key}
                        </li>
                    )}
                </ol>
            )}
        </div>
    )
}

export default SimpleHistogram
