//
//  JavaTask.m
//  Metabase
//
//  Created by Cam Saul on 11/24/15.
//  Copyright (c) 2015 Metabase. All rights reserved.
//

#import "JavaTask.h"

NSString *JREPath() {
	return [[NSBundle mainBundle] pathForResource:@"java" ofType:nil inDirectory:@"jre/bin"];
}

NSString *UberjarPath() {
	return [[NSBundle mainBundle] pathForResource:@"metabase" ofType:@"jar"];
}

NSString *DBPath() {
	NSString *applicationSupportDir = [NSSearchPathForDirectoriesInDomains(NSApplicationSupportDirectory, NSUserDomainMask, YES)[0] stringByAppendingPathComponent:@"Metabase"];
	if (![[NSFileManager defaultManager] fileExistsAtPath:applicationSupportDir]) {
		NSError *error = nil;
		[[NSFileManager defaultManager] createDirectoryAtPath:applicationSupportDir withIntermediateDirectories:YES attributes:nil error:&error];
		if (error) {
			NSLog(@"Error creating %@: %@", applicationSupportDir, error.localizedDescription);
		}
	}
	return [applicationSupportDir stringByAppendingPathComponent:@"metabase.db"];
}


@interface JavaTask ()
@property (strong, nonatomic, readwrite) NSPipe *pipe;
@property (strong, nonatomic, readwrite) NSFileHandle *readHandle;
@end

@implementation JavaTask

#pragma mark - Lifecycle

- (instancetype)init {
	if (self = [super init]) {
		[[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(fileHandleCompletedRead:) name:NSFileHandleReadCompletionNotification object:nil];
	}
	return self;
}

- (void)dealloc {
	[[NSNotificationCenter defaultCenter] removeObserver:self];
	[self terminate];
}


#pragma mark - Notifications

- (void)fileHandleCompletedRead:(NSNotification *)notification {
	if (!self.readHandle || notification.object != self.readHandle) return;
	
	__weak JavaTask *weakSelf = self;
	dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_BACKGROUND, 0), ^{
		if (!weakSelf) return;
		
		NSData *data = notification.userInfo[NSFileHandleNotificationDataItem];
		if (data.length) [weakSelf readHandleDidReadData:data];
		
		dispatch_async(dispatch_get_main_queue(), ^{
			[weakSelf.readHandle readInBackgroundAndNotify];
		});
	});
}



#pragma mark - Local Methods

- (void)readHandleDidReadData:(NSData *)data {
	NSString *message = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
	if (!message.length) return;
	
	[self readHandleDidRead:message];
}

- (void)readHandleDidRead:(NSString *)message {}

- (void)terminate {
	if (!self.task) return; // already dead
	
	NSLog(@"Killing %@ @ 0x%zx...", [self class], (size_t)self);
	self.task = nil;
}


#pragma mark - Getters / Setters

- (void)setTask:(NSTask *)task {
	self.pipe = nil;
	
	[_task terminate];
	_task = task;
	
	if (task) {
		self.pipe					= [NSPipe pipe];
		self.task.standardOutput	= self.pipe;
		self.task.standardError		= self.pipe;
	}
}

- (void)setPipe:(NSPipe *)pipe {
	self.readHandle = nil;
	_pipe = pipe;
	
	if (pipe) {
		self.readHandle = pipe.fileHandleForReading;
		__weak JavaTask *weakSelf = self;
		dispatch_async(dispatch_get_main_queue(), ^{
			if (weakSelf) [weakSelf.readHandle readInBackgroundAndNotify];
		});
	}
}

- (void)setReadHandle:(NSFileHandle *)readHandle {
	// handle any remaining data in the read handle before closing, if applicable
	if (_readHandle) {
		NSData *data;
		@try {
			data = [_readHandle availableData];
		}
		@catch (NSException *exception) {}
		
		if (data.length) [self readHandleDidReadData:data];
	}
	
	[_readHandle closeFile];
	_readHandle = readHandle;
}

@end
