#include <stdio.h>
#include <string.h>
#include <ctype.h>
#include <stdlib.h>

int is_variable(char *s) {
    if (!isalpha(s[0]) && s[0] != '_') return 0;
    for (int i = 1; s[i]; i++) {
        if (!isalnum(s[i]) && s[i] != '_') return 0;
    }
    return 1;
}

int is_int_str(char *s, int *is_neg) {
    int start = 0;
    if (s[0] == '-') { start = 1; *is_neg = 1; } else { *is_neg = 0; }
    if (s[start] == '\0') return 0;
    if (s[start] == '0' && s[start+1] != '\0') return 0;
    for (int i = start; s[i]; i++) {
        if (!isdigit(s[i])) return 0;
    }
    return 1;
}

int is_integer(char *s) {
    int is_neg;
    if (!is_int_str(s, &is_neg)) return 0;
    long long val = atoll(s);
    return val >= -2147483648LL && val <= 2147483647LL;
}

int is_long_int(char *s) {
    int is_neg;
    if (!is_int_str(s, &is_neg)) return 0;
    long long val = atoll(s);
    return val < -2147483648LL || val > 2147483647LL;
}

int is_float(char *s) {
    int start = (s[0] == '-') ? 1 : 0;
    int dot = 0, digit_cnt = 0;
    if (s[start] == '.') return 0;
    
    for (int i = start; s[i]; i++) {
        if (s[i] == '.') dot++;
        else if (isdigit(s[i])) digit_cnt++;
        else return 0;
    }
    if (dot != 1 || digit_cnt == 0 || s[strlen(s)-1] == '.') return 0;
    
    // Check leading zero logic
    if (s[start] == '0' && s[start+1] != '.') return 0;
    return 1;
}

long long gcd(long long a, long long b) {
    return b == 0 ? a : gcd(b, a % b);
}

int is_proper_frac(char *s) {
    char copy[100];
    strcpy(copy, s);
    char *slash = strchr(copy, '/');
    if (!slash) return 0;
    *slash = '\0';
    char *num = copy, *den = slash + 1;
    
    int is_neg;
    if (!is_int_str(num, &is_neg) || !is_int_str(den, &is_neg)) return 0;
    if (den[0] == '-' || den[0] == '0') return 0; // 分母不可負或0
    
    long long n = llabs(atoll(num));
    long long d = atoll(den);
    if (n >= d) return 0;
    if (gcd(n, d) != 1) return 0;
    return 1;
}

int is_hex(char *s) {
    if (strncmp(s, "0x", 2) != 0 && strncmp(s, "0X", 2) != 0) return 0;
    if (strlen(s) <= 2) return 0;
    for (int i = 2; s[i]; i++) {
        if (!isxdigit(s[i])) return 0;
    }
    return 1;
}

int main() {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    while (n--) {
        char s[105];
        scanf("%s", s);
        if (is_hex(s)) printf("hexadecimal int\n");
        else if (is_proper_frac(s)) printf("proper fraction\n");
        else if (is_integer(s)) printf("integer\n");
        else if (is_long_int(s)) printf("long int\n");
        else if (is_float(s)) printf("float\n");
        else if (is_variable(s)) printf("variable\n");
        else printf("error\n");
    }
    return 0;
}