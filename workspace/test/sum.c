#include <stdio.h>

int main() {
    int i, sum = 0;
    i = 10;
    while (i >= 1) {
        sum += i;
        i--;
    }
    printf("sum=%d\n", sum);
    return 0;
}
