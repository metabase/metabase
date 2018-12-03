//
//  TaskHealthChecker.h
//  Metabase
//
//  Created by Cam Saul on 10/9/15.
//  Copyright (c) 2015 Metabase. All rights reserved.
//

static NSString * const MetabaseTaskBecameHealthyNotification	= @"MetabaseTaskBecameHealthyNotification";
static NSString * const MetabaseTaskBecameUnhealthyNotification = @"MetabaseTaskBecameUnhealthyNotification";

/// Manages the MetabaseTask (server) and restarts it if it gets unresponsive
@interface TaskHealthChecker : NSObject

@property () NSUInteger port;

/// (re)start the health checker
- (void)start;
- (void)stop;

@end
