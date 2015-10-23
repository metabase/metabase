//
//  SUVersionDisplayProtocol.h
//  EyeTV
//
//  Created by Uli Kusterer on 08.12.09.
//  Copyright 2009 Elgato Systems GmbH. All rights reserved.
//

#import <Cocoa/Cocoa.h>
#import "SUExport.h"

/*!
    Applies special display formatting to version numbers.
*/
@protocol SUVersionDisplay

/*!
    Formats two version strings.

    Both versions are provided so that important distinguishing information
    can be displayed while also leaving out unnecessary/confusing parts.
*/
- (void)formatVersion:(NSString **)inOutVersionA andVersion:(NSString **)inOutVersionB;

@end
