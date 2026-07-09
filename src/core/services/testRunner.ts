import { HttpResponse, TestAssertion, TestResult } from "../models/request";
import { evaluateJsonPath } from "./jsonPath";

function getActualValue(response: HttpResponse, assertion: TestAssertion): string | undefined {
  switch (assertion.source) {
    case "status":
      return response.status.toString();
    case "time":
      return response.timeMs.toString();
    case "body":
      return response.body;
    case "header":
      return assertion.property ? response.headers[assertion.property.toLowerCase()] : undefined;
    case "jsonpath":
      return assertion.property ? evaluateJsonPath(response.body, assertion.property) : undefined;
    default:
      return undefined;
  }
}

function evaluateOperator(actual: string | undefined, operator: TestAssertion["operator"], expected: string): boolean {
  if (operator === "exists") {
    return actual !== undefined && actual !== null && actual !== "";
  }

  if (actual === undefined || actual === null) return false;

  switch (operator) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "contains":
      return actual.includes(expected);
    case "not_contains":
      return !actual.includes(expected);
    case "gt": {
      const a = parseFloat(actual);
      const b = parseFloat(expected);
      return !isNaN(a) && !isNaN(b) && a > b;
    }
    case "lt": {
      const a = parseFloat(actual);
      const b = parseFloat(expected);
      return !isNaN(a) && !isNaN(b) && a < b;
    }
    default:
      return false;
  }
}

function describeResult(assertion: TestAssertion, actual: string | undefined, passed: boolean): string {
  const source = assertion.source === "jsonpath" || assertion.source === "header"
    ? `${assertion.source}(${assertion.property})`
    : assertion.source;

  if (assertion.operator === "exists") {
    return passed ? `${source} exists` : `${source} does not exist`;
  }

  const truncated = actual !== undefined && actual.length > 60
    ? actual.slice(0, 60) + "..."
    : actual ?? "undefined";

  return passed
    ? `${source} ${assertion.operator} "${assertion.expected}"`
    : `Expected ${source} ${assertion.operator} "${assertion.expected}", got "${truncated}"`;
}

/**
 * Runs test assertions against an HTTP response and returns results.
 */
export function runAssertions(response: HttpResponse, assertions: TestAssertion[]): TestResult[] {
  return assertions.map((assertion) => {
    const actual = getActualValue(response, assertion);
    const passed = evaluateOperator(actual, assertion.operator, assertion.expected);
    return {
      assertionId: assertion.id,
      passed,
      actual: actual ?? "",
      message: describeResult(assertion, actual, passed),
    };
  });
}
