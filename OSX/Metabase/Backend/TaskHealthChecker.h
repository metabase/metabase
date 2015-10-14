//
//  TaskHealthChecker.h
//  Metabase
//
//  Created by Cam Saul on 10/9/15.
//  Copyright (c) 2015 Metabase. All rights reserved.
//

static NSString * const MetabaseTaskBecameHealthyNotification	= @"MetabaseTaskBecameHealthyNotification";
static NSString * const MetabaseTaskBecameUnhealthyNotification = @"MetabaseTaskBecameUnhealthyNotification";
static NSString * const MetabaseTaskTimedOutNotification		= @"MetabaseTaskTimedOutNotification";

@interface TaskHealthChecker : NSObject

@property () NSUInteger port;

- (void)start;
- (void)stop;
- (void)resetTimeout;

- (CFAbsoluteTime)lastCheckTime;

@end
