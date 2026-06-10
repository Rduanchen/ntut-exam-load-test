export interface K6TestConfig {
  mode: 'pure' | 'simulation';
  targetHost: string;
  users: TestUser[];
}

export interface TestUser {
  testId: string;
  ip: string;
  deviceUuid: string;
  aesKey: string; // Used for simulation mode
}

export interface SlaveRegistration {
  slaveId: string;
  host: string;
}

export interface MasterConfigPayload {
  slaveId: string;
  mode: 'pure' | 'simulation';
  targetHost: string;
  users: TestUser[];
}

export interface K6SummaryReport {
  metrics: {
    http_req_duration?: {
      values: {
        avg: number;
        "p(90)": number;
        "p(95)": number;
      };
    };
    http_req_failed?: {
      values: {
        passes: number;
        fails: number;
        value: number;
      };
    };
    http_reqs?: {
      values: {
        count: number;
        rate: number;
      };
    };
    iterations?: {
      values: {
        count: number;
        rate: number;
      };
    };
    vus?: {
      values: {
        value: number;
        max: number;
      };
    };
  };
}
