//
//  SUStandardVersionComparator.h
//  Sparkle
//
//  Created by Andy Matuschak on 12/21/07.
//  Copyright 2007 Andy Matuschak. All rights reserved.
//

#ifndef SUSTANDARDVERSIONCOMPARATOR_H
#define SUSTANDARDVERSIONCOMPARATOR_H

#import <Foundation/Foundation.h>
#import "SUExport.h"
#import "SUVersionComparisonProtocol.h"

/*!
    Sparkle's default version comparator.

    This comparator is adapted from MacPAD, by Kevin Ballard.
    It's "dumb" in that it does essentially string comparison,
    in components split by character type.
*/
SU_EXPORT @interface SUStandardVersionComparator : NSObject <SUVersionComparison>

/*!
    Returns a singleton instance of the comparator.
*/
+ (SUStandardVersionComparator *)defaultComparator;

/*!
    Compares version strings through textual analysis.

    See the implementation for more details.
*/
- (NSComparisonResult)compareVersion:(NSString *)versionA toVersion:(NSString *)versionB;
@end

#endif
